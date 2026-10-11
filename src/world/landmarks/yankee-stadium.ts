// =====================================================================
// Yankee Stadium — cartoon version.
//
// Reference points kept: the pale limestone outer wall with tall arched
// windows and the gold "YANKEE STADIUM" lettering band (here a navy band),
// a steep bowl of navy seats around a bright green field with a dirt
// diamond, and the white frieze (the famous scalloped facade) along the
// top of the roof. Toy proportions, one draw call.
// =====================================================================

import * as THREE from 'three';
import { LANDMARKS } from './registry.ts';
import { Toy } from './toy.ts';

const STONE = '#e8e0cf';
const NAVY = '#1c2b5a';
const SEATS = '#2f4e9a';
const GRASS = '#4caf50';
const DIRT = '#c98b54';

LANDMARKS.add({
  id: 'yankeeStadium',
  build({ inner, group }) {
    const cx = (inner.minX + inner.maxX) / 2;
    const cz = (inner.minZ + inner.maxZ) / 2;
    const rx = Math.min(inner.maxX - inner.minX, 140) / 2 - 1;
    const sz = Math.min(0.95, (inner.maxZ - inner.minZ) / 2 / rx);
    const toy = new Toy();
    // Hollow ring: outer wall (open cylinder, both faces) of a given radius.
    // Open shapes need their inside too: a mirrored copy faces inward.
    const both = (geo: THREE.BufferGeometry, color: string) => {
      toy.add(geo, color);
      toy.add(geo.clone().translate(-cx, 0, 0).scale(-1, 1, 1).translate(cx, 0, 0), color);
    };
    const wall = (r: number, h: number, y0: number, color: string) => both(new THREE.CylinderGeometry(r, r, h, 48, 1, true).scale(1, 1, sz).translate(cx, y0 + h / 2, cz), color);
    // The outer limestone wall, a navy lettering band, and the frieze on top.
    wall(rx, 14, 0, STONE);
    wall(rx + 0.2, 2.2, 10, NAVY);
    wall(rx + 0.4, 1.4, 15.2, '#ffffff');
    // Arched windows: dark slots around the wall.
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      toy.block(2.4, 6, 0.6, cx + Math.cos(a) * (rx + 0.1), 2, cz + Math.sin(a) * (rx + 0.1) * sz, '#6d7a8c', 0.4);
    }
    // The seating bowl: a cone sloping down to the field.
    both(new THREE.CylinderGeometry(rx - 1, rx * 0.62, 13, 48, 1, true).scale(1, 1, sz).translate(cx, 8, cz), SEATS);
    // The field and the infield diamond.
    toy.add(new THREE.CylinderGeometry(rx * 0.62, rx * 0.62, 0.4, 40).scale(1, 1, sz).translate(cx, 1.4, cz), GRASS);
    toy.add(new THREE.BoxGeometry(rx * 0.42, 0.3, rx * 0.42).rotateY(Math.PI / 4).translate(cx, 1.65, cz + rx * 0.12 * sz), DIRT);
    toy.add(new THREE.BoxGeometry(rx * 0.3, 0.32, rx * 0.3).rotateY(Math.PI / 4).translate(cx, 1.7, cz + rx * 0.12 * sz), GRASS);
    // Four light towers.
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const lx = cx + dx * rx * 0.72, lz = cz + dz * rx * 0.72 * sz;
      toy.cyl(0.5, 0.7, 26, lx, 0, lz, '#9aa3ad', 6);
      toy.block(6, 2.4, 1, lx, 26, lz, '#f4f1ea', 0.2);
    }
    group.add(toy.build('landmark-yankee-stadium'));
  },
});
