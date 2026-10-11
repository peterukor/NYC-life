// =====================================================================
// Statue of Liberty — cartoon version, on her own island in the river.
//
// Recognisable at a glance: mint-green patina, the spiky crown, the
// torch held high (its flame glows), the tablet in her left arm, on a
// tall stone pedestal inside a star-shaped fort. Chunky toy proportions.
// The island sits in the water just off the place's sidewalk.
// =====================================================================

import * as THREE from 'three';
import { LANDMARKS } from './registry.ts';
import { Toy } from './toy.ts';

const PATINA = '#7fcdb4';
const PATINA_DARK = '#5fb39a';
const STONE = '#e4d6bd';
const GRASS = '#86cf73';

LANDMARKS.add({
  id: 'statueOfLiberty',
  build({ block, group, track, animate }) {
    // Out in the river, west of the block.
    const x = block.minX - 95;
    const z = (block.minZ + block.maxZ) / 2;
    const toy = new Toy();
    // Island, star fort and lawn.
    toy.cyl(34, 38, 3, x, -1.5, z, '#d8c9a8', 24);
    toy.cyl(30, 32, 1.6, x, 1.5, z, GRASS, 24);
    const star = new THREE.Shape();
    for (let i = 0; i < 22; i++) {
      const r = i % 2 ? 11 : 17;
      const a = (i / 22) * Math.PI * 2;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    toy.add(new THREE.ExtrudeGeometry(star, { depth: 4, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(x, 3.1, z), '#cdbf9f');
    // Pedestal.
    toy.block(14, 16, 14, x, 7.1, z, STONE, 0.08);
    toy.block(15.5, 1.5, 15.5, x, 23, z, '#d1c2a4', 0.3);
    toy.block(11, 7, 11, x, 24.5, z, STONE, 0.08);
    const base = 31.5;
    // Robe: a tall flared cone, then shoulders and head.
    toy.cyl(3.6, 6.5, 24, x, base, z, PATINA, 16);
    toy.cyl(3.4, 3.6, 4, x, base + 24, z, PATINA_DARK, 16);
    toy.sphere(2.6, x, base + 30.5, z, PATINA);
    // Crown: a band and seven spikes.
    toy.cyl(2.5, 2.7, 1, x, base + 31.4, z, PATINA_DARK, 14);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI; // spikes fan out over the front and sides
      const g = new THREE.ConeGeometry(0.45, 3.6, 6).rotateX(Math.PI / 2 - 0.5).rotateY(-a + Math.PI / 2);
      g.translate(x + Math.cos(a) * 3.2, base + 33.2, z + Math.sin(a) * 3.2);
      toy.add(g, PATINA);
    }
    // Raised right arm and torch.
    toy.add(new THREE.CylinderGeometry(0.9, 1.1, 13, 10).translate(0, 6.5, 0).rotateZ(-0.18).translate(x + 3.2, base + 26, z), PATINA);
    toy.cyl(1.6, 0.9, 2.2, x + 5.6, base + 38.4, z, '#d4b24c', 10);
    // Left arm holding the tablet.
    toy.block(3, 4.6, 1.2, x - 4.2, base + 17, z + 1.5, PATINA_DARK, 0.2);
    group.add(toy.build('landmark-liberty'));
    // The torch flame glows (brighter at night through the bloom-free toon look).
    const flame = new THREE.Mesh(track(new THREE.SphereGeometry(1.6, 12, 8).scale(1, 1.5, 1)), track(new THREE.MeshBasicMaterial({ color: '#ffb547', toneMapped: false })));
    flame.position.set(x + 5.6, base + 42, z);
    flame.userData.landmarkLight = true;
    group.add(flame);
    let t = 0;
    animate((dt) => {
      t += dt;
      flame.scale.set(1 + Math.sin(t * 7) * 0.06, 1 + Math.sin(t * 9) * 0.1, 1 + Math.cos(t * 7) * 0.06);
    });
  },
});
